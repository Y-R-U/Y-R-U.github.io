/* main.js - Entry point: wire up all systems and start the game */
'use strict';

(function () {
    const canvas = document.getElementById('game-canvas');

    // Init all systems
    Renderer.init(canvas);
    Input.init(canvas);
    GameAudio.init();
    LevelManager.init();
    PowerUps.init();
    Rewards.init();

    // Draw initial paper background
    Renderer.drawPaper();

    // UI callbacks
    UI.init({
        onPlayClick() {
            showLevelSelect();
        },
        onLevelSelect(index) {
            Game.startLevel(index);
        },
        onNextLevel() {
            const next = Game.getCurrentLevel() + 1;
            if (next < LEVELS.length) {
                Game.startLevel(next);
            } else {
                showLevelSelect();
            }
        },
        onRetryLevel() {
            if (Game.isChallenge()) {
                Game.startChallenge(Rewards.getChallengeLevel());
            } else {
                Game.startLevel(Game.getCurrentLevel());
            }
        },
        onChallengeStart() {
            Game.startChallenge(Rewards.getChallengeLevel());
        },
        onBackToLevels() {
            Game.stopLevel();
            showLevelSelect();
        },
        onBackToTitle() {
            Game.stopLevel();
            GameAudio.stopMusic();
            UI.showScreen('title-screen');
            UI.showHUD(false);
            Renderer.drawPaper();
        },
    });

    function showLevelSelect() {
        const states = LevelManager.getStates();
        UI.buildLevelGrid(states, (index) => {
            Game.startLevel(index);
        });
        UI.showScreen('level-select-screen');
        UI.showHUD(false);
    }

    // Handle resize
    window.addEventListener('resize', () => {
        Renderer.resize();
        if (Game.getState() === 'idle') {
            Renderer.drawPaper();
        }
    });

    // Start game loop (RAF-based, safe to call once)
    Game.startLoop();

    // Show title screen
    UI.showScreen('title-screen');
})();
