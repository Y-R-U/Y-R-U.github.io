/* ui.js - Screen management, popups, HUD updates, level grid */
'use strict';

const UI = (() => {
    const LEVELS_PER_PAGE = 10;
    const screens = {};
    let currentScreen = null;

    // Pagination state for level-select grid
    let levelPage = 0;
    let levelGridStates = [];
    let levelGridOnSelect = null;

    // Callbacks set by main.js
    let onPlayClick = null;
    let onLevelSelect = null;
    let onNextLevel = null;
    let onRetryLevel = null;
    let onBackToLevels = null;
    let onBackToTitle = null;
    let onChallengeStart = null;

    // Power-up buttons currently showing an active effect
    const activePowerups = {};

    function init(callbacks) {
        onPlayClick = callbacks.onPlayClick;
        onLevelSelect = callbacks.onLevelSelect;
        onNextLevel = callbacks.onNextLevel;
        onRetryLevel = callbacks.onRetryLevel;
        onBackToLevels = callbacks.onBackToLevels;
        onBackToTitle = callbacks.onBackToTitle;
        onChallengeStart = callbacks.onChallengeStart;

        // Cache screen elements
        const ids = ['title-screen', 'how-to-play-screen', 'level-select-screen',
                     'level-complete-screen', 'level-failed-screen', 'settings-screen',
                     'game-complete-screen', 'quit-confirm-screen',
                     'daily-reward-screen', 'challenge-screen'];
        ids.forEach(id => { screens[id] = document.getElementById(id); });

        // Button bindings
        bindBtn('play-btn', () => { GameAudio.SFX.buttonClick(); onPlayClick?.(); });
        bindBtn('how-to-play-btn', () => { GameAudio.SFX.buttonClick(); showScreen('how-to-play-screen'); });
        bindBtn('how-to-play-back', () => { GameAudio.SFX.buttonClick(); showScreen('title-screen'); });
        bindBtn('level-select-back', () => { GameAudio.SFX.buttonClick(); onBackToTitle?.(); });
        bindBtn('level-prev-btn', () => {
            if (levelPage > 0) {
                GameAudio.SFX.buttonClick();
                levelPage--;
                renderLevelPage();
            }
        });
        bindBtn('level-next-btn', () => {
            const totalPages = Math.max(1, Math.ceil(LEVELS.length / LEVELS_PER_PAGE));
            if (levelPage < totalPages - 1) {
                GameAudio.SFX.buttonClick();
                levelPage++;
                renderLevelPage();
            }
        });
        bindBtn('complete-next-btn', () => { GameAudio.SFX.buttonClick(); onNextLevel?.(); });
        bindBtn('complete-levels-btn', () => { GameAudio.SFX.buttonClick(); onBackToLevels?.(); });
        bindBtn('failed-retry-btn', () => { GameAudio.SFX.buttonClick(); onRetryLevel?.(); });
        bindBtn('failed-levels-btn', () => { GameAudio.SFX.buttonClick(); onBackToLevels?.(); });
        bindBtn('game-complete-btn', () => { GameAudio.SFX.buttonClick(); onBackToTitle?.(); });
        bindBtn('hud-back-btn', () => { GameAudio.SFX.buttonClick(); showQuitConfirm(); });

        // Quit confirm buttons
        bindBtn('quit-yes-btn', () => { GameAudio.SFX.buttonClick(); hideQuitConfirm(); onBackToLevels?.(); });
        bindBtn('quit-no-btn', () => { GameAudio.SFX.buttonClick(); hideQuitConfirm(); });

        // Daily reward & challenge
        bindBtn('daily-reward-btn', () => { GameAudio.SFX.buttonClick(); showDailyPopup(); });
        bindBtn('daily-close-btn', () => { GameAudio.SFX.buttonClick(); showScreen('title-screen'); });
        bindBtn('daily-claim-btn', () => { claimDailyReward(); });
        bindBtn('daily-challenge-btn', () => { GameAudio.SFX.buttonClick(); showChallengePopup(); });
        bindBtn('challenge-close-btn', () => { GameAudio.SFX.buttonClick(); showScreen('title-screen'); });
        bindBtn('challenge-play-btn', () => { GameAudio.SFX.buttonClick(); onChallengeStart?.(); });

        // Settings
        bindBtn('settings-btn', () => { GameAudio.SFX.buttonClick(); toggleSettings(); });
        bindBtn('settings-close', () => { GameAudio.SFX.buttonClick(); hideSettings(); });
        bindBtn('sfx-toggle', () => { toggleSettingBtn('sfx-toggle', GameAudio.toggleSfx()); });
        bindBtn('music-toggle', () => { toggleSettingBtn('music-toggle', GameAudio.toggleMusic()); });
        bindBtn('vibrate-toggle', () => { toggleSettingBtn('vibrate-toggle', GameAudio.toggleVibrate()); });

        // Init toggle states from saved prefs
        updateToggleBtn('sfx-toggle', GameAudio.sfxEnabled);
        updateToggleBtn('music-toggle', GameAudio.musicEnabled);
        updateToggleBtn('vibrate-toggle', GameAudio.vibrateEnabled);
    }

    function bindBtn(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    function toggleSettingBtn(id, state) {
        GameAudio.SFX.buttonClick();
        updateToggleBtn(id, state);
    }

    function updateToggleBtn(id, isOn) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('on', isOn);
        el.classList.toggle('off', !isOn);
        el.textContent = isOn ? 'ON' : 'OFF';
    }

    // === Settings panel ===
    let settingsOpen = false;
    function toggleSettings() {
        if (settingsOpen) hideSettings();
        else showSettings();
    }
    function showSettings() {
        if (screens['settings-screen']) screens['settings-screen'].classList.add('active');
        settingsOpen = true;
    }
    function hideSettings() {
        if (screens['settings-screen']) screens['settings-screen'].classList.remove('active');
        settingsOpen = false;
    }
    function isSettingsOpen() { return settingsOpen; }

    // === Quit confirm ===
    let quitOpen = false;
    function showQuitConfirm() {
        if (screens['quit-confirm-screen']) screens['quit-confirm-screen'].classList.add('active');
        quitOpen = true;
    }
    function hideQuitConfirm() {
        if (screens['quit-confirm-screen']) screens['quit-confirm-screen'].classList.remove('active');
        quitOpen = false;
    }
    function isQuitOpen() { return quitOpen; }

    // === Screen management ===
    function showScreen(id) {
        // Hide all screens except settings overlay
        Object.entries(screens).forEach(([key, s]) => {
            if (s && key !== 'settings-screen' && key !== 'quit-confirm-screen') {
                s.classList.remove('active');
            }
        });
        if (screens[id]) {
            screens[id].classList.add('active');
            currentScreen = id;
        }
        if (id === 'title-screen') updateTitleBadges();
        // Update cog visibility
        updateCogVisibility(id);
    }

    function hideAllScreens() {
        Object.values(screens).forEach(s => { if (s) s.classList.remove('active'); });
        currentScreen = null;
        settingsOpen = false;
        quitOpen = false;
        updateCogVisibility(null);
    }

    function updateCogVisibility(screenId) {
        const cog = document.getElementById('settings-btn');
        if (!cog) return;
        // Hide cog on title and level-select (they have their own full backgrounds)
        const hiddenOn = ['title-screen', 'how-to-play-screen', 'level-select-screen',
                          'game-complete-screen', 'daily-reward-screen', 'challenge-screen'];
        if (hiddenOn.includes(screenId)) {
            cog.style.display = 'none';
        } else {
            cog.style.display = '';
        }
    }

    function showHUD(show) {
        const hud = document.getElementById('game-hud');
        hud.classList.toggle('hidden', !show);
        const bar = document.getElementById('powerup-bar');
        if (bar) bar.classList.toggle('hidden', !show);
    }

    function updateHUD(label, goalText, timeRemaining, inkFrac) {
        document.getElementById('hud-level').textContent = label;
        document.getElementById('hud-goal').textContent = goalText;

        const mins = Math.floor(timeRemaining / 60);
        const secs = Math.floor(timeRemaining % 60);
        const timerEl = document.getElementById('hud-timer');
        timerEl.textContent = mins + ':' + String(secs).padStart(2, '0');

        // Flash timer red when low on time
        if (timeRemaining <= CONFIG.LOW_TIME_WARN) {
            timerEl.classList.add('low-time');
        } else {
            timerEl.classList.remove('low-time');
        }

        const bar = document.getElementById('ink-bar');
        const container = document.getElementById('ink-bar-container');
        bar.style.width = (inkFrac * 100) + '%';

        // Color ink bar based on level
        if (inkFrac < 0.2) bar.style.background = 'linear-gradient(90deg, #c44, #e66)';
        else if (inkFrac < 0.5) bar.style.background = 'linear-gradient(90deg, #c98a2e, #daa840)';
        else bar.style.background = 'linear-gradient(90deg, #3a5a9f, #5a7abf)';

        // Empty class when ink is below the minimum needed to start a stroke
        const inkAbsolute = inkFrac * CONFIG.INK_MAX;
        if (container) container.classList.toggle('empty', inkAbsolute < CONFIG.INK_START_MIN);
    }

    function flashInkEmpty() {
        const container = document.getElementById('ink-bar-container');
        if (!container) return;
        container.classList.remove('shake');
        // Force reflow so the animation restarts even on rapid retries
        void container.offsetWidth;
        container.classList.add('shake');
    }

    function buildLevelGrid(levelStates, onSelect) {
        levelGridStates = levelStates;
        levelGridOnSelect = onSelect;

        // Jump to the page containing the 'current' level (or first unlocked-not-completed)
        const totalPages = Math.max(1, Math.ceil(LEVELS.length / LEVELS_PER_PAGE));
        let focusIdx = levelStates.findIndex(s => s && s.current);
        if (focusIdx < 0) focusIdx = levelStates.findIndex(s => s && s.unlocked && !s.completed);
        if (focusIdx < 0) focusIdx = 0;
        levelPage = Math.min(totalPages - 1, Math.floor(focusIdx / LEVELS_PER_PAGE));

        renderLevelPage();
    }

    function renderLevelPage() {
        const grid = document.getElementById('level-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const totalPages = Math.max(1, Math.ceil(LEVELS.length / LEVELS_PER_PAGE));
        const start = levelPage * LEVELS_PER_PAGE;
        const end = Math.min(LEVELS.length, start + LEVELS_PER_PAGE);

        for (let i = start; i < end; i++) {
            const btn = document.createElement('button');
            btn.className = 'level-btn';
            const state = levelGridStates[i] || {};

            if (state.unlocked) {
                btn.innerHTML = `<span>${i + 1}</span><span class="level-stars">${starsHTML(state.stars || 0)}</span>`;
                if (state.current) btn.classList.add('current');
                btn.addEventListener('click', () => {
                    GameAudio.SFX.buttonClick();
                    levelGridOnSelect?.(i);
                });
            } else {
                btn.classList.add('locked');
                btn.innerHTML = `<span>&#128274;</span>`;
            }
            grid.appendChild(btn);
        }

        // Update pager controls
        const label = document.getElementById('level-page-label');
        if (label) label.textContent = `${levelPage + 1} / ${totalPages}`;
        const prevBtn = document.getElementById('level-prev-btn');
        const nextBtn = document.getElementById('level-next-btn');
        if (prevBtn) prevBtn.disabled = levelPage === 0;
        if (nextBtn) nextBtn.disabled = levelPage >= totalPages - 1;
    }

    function starsHTML(count) {
        let s = '';
        for (let i = 0; i < 3; i++) s += i < count ? '★' : '☆';
        return s;
    }

    function renderCompleteStars(stars, time) {
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
    }

    function showLevelComplete(stars, time, levelNum) {
        document.getElementById('complete-title').textContent = 'Level Complete!';
        document.getElementById('complete-rewards').classList.add('hidden');
        renderCompleteStars(stars, time);

        // Hide next button if last level
        const nextBtn = document.getElementById('complete-next-btn');
        nextBtn.style.display = levelNum >= LEVELS.length ? 'none' : '';

        showScreen('level-complete-screen');
    }

    // Challenge completion reuses the level-complete popup with a reward line
    function showChallengeComplete(stars, time, rewardItems) {
        document.getElementById('complete-title').textContent = 'Challenge Complete!';
        renderCompleteStars(stars, time);

        const rewardEl = document.getElementById('complete-rewards');
        if (rewardItems) {
            rewardEl.textContent = 'Reward: ' + formatItems(rewardItems);
            GameAudio.SFX.reward();
        } else {
            rewardEl.textContent = 'Already completed today — played for glory!';
        }
        rewardEl.classList.remove('hidden');

        // No "next level" from a challenge
        document.getElementById('complete-next-btn').style.display = 'none';

        showScreen('level-complete-screen');
    }

    function showLevelFailed() {
        showScreen('level-failed-screen');
    }

    // === Power-up bar (in-game) ===

    function updatePowerupBar() {
        const bar = document.getElementById('powerup-bar');
        if (!bar) return;
        bar.innerHTML = '';
        const inv = PowerUps.getAll();
        for (const [type, def] of Object.entries(PowerUps.TYPES)) {
            const count = inv[type] || 0;
            const btn = document.createElement('button');
            btn.className = 'powerup-btn';
            btn.dataset.type = type;
            btn.title = `${def.name}: ${def.desc}`;
            btn.innerHTML = `<span class="pu-icon">${def.icon}</span><span class="pu-count">${count}</span>`;
            if (count <= 0) btn.disabled = true;
            if (activePowerups[type]) btn.classList.add('active');
            btn.addEventListener('click', () => Game.activatePowerUp(type));
            bar.appendChild(btn);
        }
    }

    function setPowerupActive(type, isActive) {
        activePowerups[type] = isActive;
        const bar = document.getElementById('powerup-bar');
        if (!bar) return;
        const btn = bar.querySelector(`.powerup-btn[data-type="${type}"]`);
        if (btn) btn.classList.toggle('active', !!isActive);
    }

    function resetPowerupActive() {
        for (const key of Object.keys(activePowerups)) activePowerups[key] = false;
    }

    // === Daily reward & events ===

    function formatItems(items) {
        return Object.entries(items)
            .map(([type, count]) => `${PowerUps.TYPES[type].icon}×${count}`)
            .join('  ');
    }

    function renderDailyPopup(claimedNow) {
        const info = Rewards.peekDaily();
        document.getElementById('daily-title').textContent = `Daily Reward — Day ${info.day}`;

        const eventLine = document.getElementById('daily-event-line');
        if (info.event) {
            eventLine.textContent = `${info.event.icon} ${info.event.name}: ${info.event.desc}`;
            eventLine.classList.remove('hidden');
        } else {
            eventLine.classList.add('hidden');
        }

        // 7-day streak chips
        const daysEl = document.getElementById('daily-days');
        daysEl.innerHTML = '';
        for (let i = 1; i <= 7; i++) {
            const chip = document.createElement('span');
            chip.className = 'day-chip' +
                (i < info.day ? ' done' : '') +
                (i === info.day ? ' today' : '');
            chip.textContent = i;
            daysEl.appendChild(chip);
        }

        // Reward items
        const itemsEl = document.getElementById('daily-items');
        itemsEl.innerHTML = '';
        for (const [type, count] of Object.entries(info.items)) {
            const def = PowerUps.TYPES[type];
            const item = document.createElement('div');
            item.className = 'reward-item';
            item.innerHTML = `<span class="ri-icon">${def.icon}</span><span class="ri-label">${def.name} ×${count}</span>`;
            itemsEl.appendChild(item);
        }

        const note = document.getElementById('daily-note');
        const claimBtn = document.getElementById('daily-claim-btn');
        if (claimedNow) {
            note.textContent = 'Added to your satchel! Come back tomorrow to grow the streak.';
            claimBtn.disabled = true;
        } else if (info.claimable) {
            note.textContent = 'Claim every day to grow your streak — day 7 is a mega bundle!';
            claimBtn.disabled = false;
        } else {
            note.textContent = `Already claimed today (streak: ${Rewards.getStreak()}). Come back tomorrow!`;
            claimBtn.disabled = true;
        }
    }

    function showDailyPopup() {
        renderDailyPopup(false);
        showScreen('daily-reward-screen');
    }

    function claimDailyReward() {
        const reward = Rewards.claimDaily();
        if (!reward) return;
        GameAudio.SFX.reward();
        GameAudio.vibrate([20, 30, 20]);
        renderDailyPopup(true);
        updateTitleBadges();
    }

    function showChallengePopup() {
        const level = Rewards.getChallengeLevel();
        document.getElementById('challenge-desc').textContent =
            `Today: ${level.description} (${level.ants.length} ant${level.ants.length > 1 ? 's' : ''}, ${level.timeLimit}s)`;
        const status = document.getElementById('challenge-status');
        if (Rewards.isChallengeDone()) {
            status.textContent = '✓ Completed today — reward collected. Replay for glory!';
        } else {
            const event = Rewards.getTodayEvent();
            status.textContent = (event && event.mult)
                ? `Beat it once today for DOUBLED bonus power-ups! ${event.icon}`
                : 'Beat it once today for bonus power-ups!';
        }
        showScreen('challenge-screen');
    }

    function updateTitleBadges() {
        // Red dot on the daily reward button while unclaimed
        const badge = document.getElementById('daily-badge');
        if (badge) badge.classList.toggle('hidden', !Rewards.canClaimDaily());

        // Challenge button shows a check once done
        const chBtn = document.getElementById('daily-challenge-btn');
        if (chBtn) {
            chBtn.innerHTML = Rewards.isChallengeDone()
                ? '&#9889; Daily Challenge ✓'
                : '&#9889; Daily Challenge';
        }

        // Event banner
        const banner = document.getElementById('event-banner');
        if (banner) {
            const event = Rewards.getTodayEvent();
            if (event) {
                banner.textContent = `${event.icon} ${event.name} — ${event.desc}`;
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
            }
        }
    }

    function showGameComplete(totalStars, maxStars) {
        document.getElementById('total-stars').textContent = `Total Stars: ${totalStars} / ${maxStars}`;
        showScreen('game-complete-screen');
    }

    return {
        init, showScreen, hideAllScreens, showHUD, updateHUD, flashInkEmpty,
        buildLevelGrid, showLevelComplete, showLevelFailed, showGameComplete,
        isSettingsOpen, hideSettings, isQuitOpen, hideQuitConfirm,
        updatePowerupBar, setPowerupActive, resetPowerupActive, showChallengeComplete,
        showDailyPopup, showChallengePopup, updateTitleBadges,
    };
})();
