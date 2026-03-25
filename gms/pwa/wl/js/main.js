// main.js - Game initialization and main loop
'use strict';

const Game = {
    running: false,

    init() {
        const canvas = document.getElementById('game-canvas');
        Renderer.init(canvas);
        UI.init();

        window.addEventListener('resize', () => {
            Renderer.resize();
        });

        Screens.showTitle();
        this.running = true;
        this._loop();
    },

    _loop() {
        if (!this.running) return;
        Renderer.render();
        requestAnimationFrame(() => this._loop());
    },
};

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
