/* main.js - Entry point: wire up all systems and start the game */
'use strict';

(function () {
    const canvas = document.getElementById('game-canvas');

    // Init all systems
    Renderer.init(canvas);
    Input.init(canvas);
    Audio.init();
    LevelManager.init();

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
            Game.startLevel(Game.getCurrentLevel());
        },
        onBackToLevels() {
            Game.stopLevel();
            showLevelSelect();
        },
        onBackToTitle() {
            Game.stopLevel();
            Audio.stopMusic();
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

    // Start game loop
    Game.startLoop();

    // Show title screen
    UI.showScreen('title-screen');
})();
