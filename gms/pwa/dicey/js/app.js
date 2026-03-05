/* ============================================
   DICEY - Main Application Entry Point
   ============================================ */

const App = {
    titleAnimFrame: 0,
    titleAnimId: null,

    init() {
        AudioManager.init();
        UI.init();

        this.setupTitleScreen();
        this.setupEventListeners();

        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    },

    setupTitleScreen() {
        const canvas = document.getElementById('title-dice-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = 120 * dpr;
            canvas.height = 120 * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const animate = () => {
                this.titleAnimFrame++;
                Sprites.drawTitleDice(ctx, 120, 120, this.titleAnimFrame);
                this.titleAnimId = requestAnimationFrame(animate);
            };
            animate();
        }
    },

    setupEventListeners() {
        document.getElementById('btn-new-game').addEventListener('click', () => {
            AudioManager.playSfx('click');
            this.startNewGame();
        });

        document.getElementById('btn-how-to-play').addEventListener('click', () => {
            AudioManager.playSfx('click');
            UI.showHowToPlay();
        });

        document.getElementById('btn-settings').addEventListener('click', () => {
            AudioManager.playSfx('click');
            UI.showSettings();
        });
    },

    startNewGame() {
        // Stop title animation
        if (this.titleAnimId) {
            cancelAnimationFrame(this.titleAnimId);
            this.titleAnimId = null;
        }

        // Switch screens
        document.getElementById('title-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        // Initialize game
        Game.init();

        // Initialize board
        const boardCanvas = document.getElementById('board-canvas');
        BoardRenderer.init(boardCanvas);

        // Initial draw
        BoardRenderer.draw(Game.state);
        UI.updateHUD(Game.state);

        // Init dice display
        const diceCanvas = document.getElementById('dice-canvas');
        const dctx = diceCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        diceCanvas.width = 140 * dpr;
        diceCanvas.height = 70 * dpr;
        dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        Sprites.drawDicePair(dctx, 140, 70);

        // Start music
        AudioManager.playMusic();

        // Show welcome prompt
        UI.showWelcomePrompt(() => {
            Game.startTurn();
        });
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
