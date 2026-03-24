/* DRace - App Entry Point */
(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // Init audio
    Audio.init();

    // Title particles
    let particleResizeHandler = null;

    function initParticles() {
        const canvas = document.getElementById('title-particles');
        if (!canvas) return;

        // Stop previous instance if any
        if (canvas._stopParticles) canvas._stopParticles();
        if (particleResizeHandler) window.removeEventListener('resize', particleResizeHandler);

        const ctx = canvas.getContext('2d');
        let particles = [];
        let w, h;

        function resize() {
            w = canvas.width = canvas.parentElement.clientWidth;
            h = canvas.height = canvas.parentElement.clientHeight;
        }
        resize();
        particleResizeHandler = resize;
        window.addEventListener('resize', resize);

        class Particle {
            constructor() { this.reset(); }
            reset() {
                this.x = Math.random() * w;
                this.y = Math.random() * h;
                this.size = Math.random() * 2.5 + 0.5;
                this.speedX = (Math.random() - 0.5) * 0.3;
                this.speedY = (Math.random() - 0.5) * 0.3;
                this.opacity = Math.random() * 0.5 + 0.1;
                this.hue = Math.random() > 0.5 ? 195 : 35;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) this.reset();
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 80%, 60%, ${this.opacity})`;
                ctx.fill();
            }
        }

        for (let i = 0; i < 60; i++) particles.push(new Particle());

        let running = true;
        function animate() {
            if (!running) return;
            ctx.clearRect(0, 0, w, h);
            particles.forEach(p => { p.update(); p.draw(); });
            requestAnimationFrame(animate);
        }
        animate();

        canvas._stopParticles = () => {
            running = false;
            if (particleResizeHandler) {
                window.removeEventListener('resize', particleResizeHandler);
                particleResizeHandler = null;
            }
        };
    }
    initParticles();

    // --- Navigation / Buttons ---
    const btnNewGame = document.getElementById('btn-new-game');
    const btnBackSetup = document.getElementById('btn-back-setup');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnRoll = document.getElementById('btn-roll');
    const btnPlayAgain = document.getElementById('btn-play-again');
    const btnMainMenu = document.getElementById('btn-main-menu');
    const btnContinue = document.getElementById('btn-continue');
    const btnSettingsTitle = document.getElementById('btn-settings-title');
    const btnSettingsGame = document.getElementById('btn-settings-game');

    let selectedPlayerCount = 2;
    let selectedBoardSize = 45;

    // Show continue button if save exists
    function updateContinueButton() {
        btnContinue.style.display = Game.hasSave() ? '' : 'none';
    }
    updateContinueButton();

    // Continue saved game
    btnContinue.addEventListener('click', () => {
        Audio.sfxClick();
        const state = Storage.loadGame();
        if (state) Game.resume(state);
    });

    // New Game
    btnNewGame.addEventListener('click', () => {
        Audio.sfxClick();
        UI.showScreen('screen-setup');
        UI.setupAIPreview(selectedPlayerCount);
    });

    // Back to title
    btnBackSetup.addEventListener('click', () => {
        Audio.sfxClick();
        UI.showScreen('screen-title');
    });

    // Player count selection
    document.getElementById('player-count-select').addEventListener('click', (e) => {
        const btn = e.target.closest('.count-btn');
        if (!btn) return;
        Audio.sfxClick();
        document.querySelectorAll('#player-count-select .count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPlayerCount = parseInt(btn.dataset.count);
        UI.setupAIPreview(selectedPlayerCount);
    });

    // Board size selection
    document.getElementById('board-size-select').addEventListener('click', (e) => {
        const btn = e.target.closest('.count-btn');
        if (!btn) return;
        Audio.sfxClick();
        document.querySelectorAll('#board-size-select .count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedBoardSize = parseInt(btn.dataset.size);
    });

    // Start game
    btnStartGame.addEventListener('click', () => {
        Audio.sfxClick();
        const name = document.getElementById('player-name').value.trim() || 'Player';
        const slots = UI.getPlayerSlots();
        Game.create(name, selectedPlayerCount, selectedBoardSize, slots);

        // Show welcome guide if first time
        if (!Storage.hasSeenGuide()) {
            setTimeout(() => {
                UI.showWelcomeGuide(() => {
                    // Game already started, just continue
                });
            }, 500);
        }
    });

    // Roll dice
    btnRoll.addEventListener('click', () => {
        if (btnRoll.disabled) return;
        UI.setRollEnabled(false);
        Game.doRoll();
    });

    // Play again
    btnPlayAgain.addEventListener('click', () => {
        Audio.sfxClick();
        UI.showScreen('screen-setup');
    });

    // Main menu
    btnMainMenu.addEventListener('click', () => {
        Audio.sfxClick();
        UI.showScreen('screen-title');
        initParticles();
        updateContinueButton();
    });

    // Stats
    document.getElementById('btn-stats-title').addEventListener('click', () => {
        Audio.sfxClick();
        UI.showStats();
    });

    // Turn Log
    document.getElementById('btn-log-game').addEventListener('click', () => {
        Audio.sfxClick();
        UI.showTurnLog();
    });

    // Settings
    btnSettingsTitle.addEventListener('click', () => {
        Audio.sfxClick();
        UI.showSettings();
    });
    btnSettingsGame.addEventListener('click', () => {
        Audio.sfxClick();
        UI.showSettings();
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        // Escape closes overlay
        if (e.key === 'Escape') {
            UI.hideOverlay();
            return;
        }

        // Only handle game keys on game screen
        const gameScreen = document.getElementById('screen-game');
        if (!gameScreen.classList.contains('active')) return;

        // Enter/Space to roll
        if ((e.key === 'Enter' || e.key === ' ') && !btnRoll.disabled && document.getElementById('dice-area').style.display !== 'none') {
            e.preventDefault();
            UI.setRollEnabled(false);
            Game.doRoll();
            return;
        }

        // Number keys 1-9 to pick a choice
        const choiceArea = document.getElementById('choice-area');
        if (choiceArea.style.display !== 'none') {
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                const btns = document.querySelectorAll('#choice-buttons .choice-btn');
                if (btns[num - 1]) btns[num - 1].click();
            }
        }
    });
})();
